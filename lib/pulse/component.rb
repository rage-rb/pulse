# frozen_string_literal: true

class Pulse::Component < Phlex::HTML
  include Pulse::Scripts
  include Pulse::Tracking
  include Pulse::Fingerprint
  include Pulse::Marker

  # @private
  def self.__event_handlers
    @__event_handlers ||= Set.new(public_instance_methods(false) - [:view_template])
  end

  # @private
  # @param event [String]
  # @param params [Hash]
  # @param env [Hash]
  def __handle_event(event, params, env:)
    unless self.class.__event_handlers.include?(event)
      Rage.logger.debug("Unknown event received", event:)
      return
    end

    @_streamed = false

    if method(event).arity == 1
      public_send(event, params)
    else
      public_send(event)
    end

    replace unless @_streamed
  ensure
    @_streamed = false
  end

  # Re-render this component and morph it in place on the client.
  def replace
    emit(action: "replace", html: render_html)
  end

  # Render this component and append it to a target container element.
  def append(target:)
    emit(action: "append", target: target, html: render_html)
  end

  # Render this component and prepend it to a target container element.
  def prepend(target:)
    emit(action: "prepend", target: target, html: render_html)
  end

  # Remove this component's element from the client and drop it from the registry.
  def remove
    return unless Fiber[:__pulse_state]

    @__parent&.__children&.delete(@__identity)
    emit(action: "remove", id: pulse_id)
  end

  protected

  attr_accessor :__parent, :__children, :__cached_fingerprint, :__identity

  def pulse_id
    @pulse_id ||= object_id.to_s
  end

  private

  def emit(payload)
    return unless Fiber[:__pulse_state]

    @_streamed = true
    Fiber[:__pulse_state][:update].call(payload)
  end

  def render(component, key: nil, &block)
    return super(component, &block) unless Fiber[:__pulse_state] && component.is_a?(Pulse::Component)

    identity = [component.class, key]
    existing_child = @__children&.dig(identity)

    unless existing_child
      store_child_component(component, identity)
      return super(component, &block)
    end

    if existing_child.__cached_fingerprint == component.fingerprint
      existing_child.__mark
      div(id: existing_child.pulse_id, data_pulse_stub: true)

      if block
        # send blocks as distinct patches
        @__pending_pulse_id = true
        (Fiber[:__pulse_block_html] ||= []) << capture(&block)
      end
    else
      store_child_component(component, identity)
      super(component, &block)
    end
  end

  def render_html
    # Phlex normally refuses to render an instance more than once
    @_state = nil

    html = call
    block_html = Fiber[:__pulse_block_html]

    if block_html
      block_html.unshift(html)
    else
      html
    end

  ensure
    Fiber[:__pulse_block_html] = nil
  end

  def around_template
    @__pending_pulse_id = true
    super
    __activate_subscriptions
    cleanup_child_components
  ensure
    @__cached_fingerprint = fingerprint
  end

  def store_child_component(component, identity)
    (@__children ||= {})[identity] = component.tap(&:__mark)
    component.__identity = identity
    component.__parent = self
  end

  def cleanup_child_components
    @__children&.delete_if do |_, component|
      should_delete = !component.__marked?
      component.__unmark

      should_delete
    end
  end
end
