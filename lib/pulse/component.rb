# frozen_string_literal: true

class Pulse::Component < Phlex::HTML
  include Pulse::Scripts
  include Pulse::Watching
  include Pulse::Fingerprint
  include Pulse::Marker

  # @private
  def self.__event_handlers
    @__event_handlers ||= Set.new(public_instance_methods(false) - [:view_template])
  end

  # @private
  # @param event [Symbol]
  # @param data [Hash, nil] the event data (input value, key, form fields)
  def __handle_event(event, data)
    unless self.class.__event_handlers.include?(event)
      Rage.logger.debug("Unknown event received", event:)
      return
    end

    @_streamed = false

    if method(event).arity == 1
      event_payload = Pulse::Event.new(data || {})
      public_send(event, event_payload)
    else
      public_send(event)
    end

    replace unless @_streamed
  ensure
    @_streamed = false
  end

  # Re-render this component and morph it in place on the client.
  def replace
    @_streamed = true
    Pulse.__state.server_events.replace_component(self)
  end

  # Render this component and append it to a target container element.
  def append(target:)
    @_streamed = true
    Pulse.__state.server_events.append_component(self, target)
  end

  # Render this component and prepend it to a target container element.
  def prepend(target:)
    @_streamed = true
    Pulse.__state.server_events.prepend_component(self, target)
  end

  # Remove this component's element from the client and drop it from the registry.
  def remove
    @_streamed = true
    __cleanup_subscriptions
    @__parent&.__children&.delete(@__identity)
    Pulse.__state.server_events.remove_component(pulse_id)
  end

  def __pulse_dump
    # Phlex normally refuses to render an instance more than once
    @_state = nil
    call
  end

  protected

  attr_accessor :__parent, :__children, :__cached_fingerprint, :__identity

  def pulse_id
    @pulse_id ||= object_id.to_s
  end

  def render(component, key: nil, &block)
    return super(component, &block) unless Pulse.__state.live? && component.is_a?(Pulse::Component)

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
        Pulse.__state.server_events.replace_html(capture(&block))
      end
    else
      # TODO: re-render old component instead?
      existing_child.__cleanup_subscriptions
      store_child_component(component, identity)
      super(component, &block)
    end
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
      unless component.__marked?
        should_delete = true
        component.__cleanup_subscriptions
      end
      component.__unmark

      should_delete
    end
  end
end
