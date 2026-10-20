# frozen_string_literal: true

class Pulse::Component < Phlex::HTML
  include Pulse::Scripts
  include Pulse::Tracking

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

    @__parent&.__children&.delete(self)
    emit(action: "remove", id: pulse_id)
  end

  protected

  attr_accessor :__parent, :__children

  def pulse_id
    @pulse_id ||= object_id.to_s
  end

  private

  def emit(payload)
    return unless Fiber[:__pulse_state]

    @_streamed = true
    Fiber[:__pulse_state][:update].call(payload)
  end

  def render(component)
    return super unless component.is_a?(Phlex::HTML)

    component.__parent = self
    (@__children ||= []) << component

    super
  end

  def render_html
    # Phlex normally refuses to render an instance more than once
    @_state = nil
    call
  end

  def around_template
    @__pending_pulse_id = true
    @__children&.clear
    super
  end
end
