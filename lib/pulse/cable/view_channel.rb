# frozen_string_literal: true

class Pulse::Cable::ViewChannel < Rage::Cable::Channel
  def subscribed
    Fiber[:__pulse_state] = Pulse::State.new(->(payload) { transmit(payload) })
  end

  def unsubscribed
    Pulse.__state.reload
  end

  # Single client -> server entrypoint. `type` distinguishes a page navigation from an
  # event dispatched to a specific component.
  def receive(data)
    case data["type"]
    when "navigate"
      update_page(data)
      navigate(data)
    when "event"
      handle_event(data)
    when "page"
      update_page(data)
    end
  end

  private

  # Dispatch an event to the component.
  def handle_event(data)
    pulse_id, event, event_data = data["id"].to_i, data["event"].to_sym, data["data"]
    component = Pulse.__state.interactive_components[pulse_id]

    unless component
      Rage.logger.debug("Couldn't find a component to handle event", component_id: pulse_id, event:)
      return
    end

    Pulse.__state.server_events.with_batched_events do
      component.__handle_event(event, event_data)
    end
  end

  # Render a root component replacing the whole page.
  def navigate(data)
    Pulse.__state.reload

    env = build_request(data)
    _, response_headers, response_body = app.call(env)

    if location_url = response_headers["location"]
      transmit(action: "navigate", url: location_url)
    else
      transmit(action: "update", html: response_body[0])
    end
  end

  def update_page(data)
    state = Pulse.__state

    if local_storage_snapshot = data["local_storage"]
      state.local_storage_snapshot = local_storage_snapshot
    end

    if query_snapshot = data["query"]
      state.query_snapshot = query_snapshot
    end

    if url = data["url"]
      state.url = url
    end
  end

  def app
    @app ||= Rage.application
  end

  # Build the Rack env hash representing the request
  def build_request(data)
    _env = env.dup
    _env["rack.upgrade?"] = _env["rack.upgrade"] = _env["rage.request_id"] = nil

    _env["PATH_INFO"] = data["url"]
    _env["REQUEST_METHOD"] = data["method"] || "GET"
    _env["QUERY_STRING"] = data["query"] || ""

    if (body = data["body"])
      _env["rack.input"] = StringIO.new(body)
      _env["IODINE_HAS_BODY"] = true
      _env["CONTENT_TYPE"] = data["contentType"]
      _env["CONTENT_LENGTH"] = body.bytesize.to_s
    end

    _env
  end
end
