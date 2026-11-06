# frozen_string_literal: true

class Pulse::ServerEvents
  def initialize(write_closure)
    @write_closure = write_closure
    @batch = []
  end

  def with_batched_events
    @batched_events = true
    yield
  ensure
    @batched_events = false
    emit_batched_events
  end

  def replace_component(component)
    emit(:replace, component) { { action: "replace", html: component.__pulse_dump } }
  end

  def replace_html(html)
    @html_seq ||= (1..).each
    emit(:replace, @html_seq.next) { { action: "replace", html: } }
  end

  def append_component(component, target)
    emit(:append, component) { { action: "append", target:, html: component.__pulse_dump } }
  end

  def prepend_component(component, target)
    emit(:prepend, component) { { action: "prepend", target:, html: component.__pulse_dump } }
  end

  def remove_component(component_id)
    emit(:remove, component_id) { { action: "remove", id: component_id } }
  end

  private

  def replace_events
    @replace_events ||= {}
  end

  def append_events
    @append_events ||= {}
  end

  def prepend_events
    @prepend_events ||= {}
  end

  def remove_events
    @remove_events ||= {}
  end

  def emit(event_type, event_id = event_type, &block)
    unless @batched_events
      @write_closure&.call(yield)
      return
    end

    registry = case event_type
    when :replace
      replace_events
    when :append
      append_events
    when :prepend
      prepend_events
    when :remove
      remove_events
    end

    unless registry.has_key?(event_id)
      registry[event_id] = true
      @batch << yield
    end
  end

  def emit_batched_events
    @write_closure&.call(@batch)
  ensure
    @batch.clear
    @replace_events&.clear
    @append_events&.clear
    @prepend_events&.clear
    @remove_events&.clear
  end
end
