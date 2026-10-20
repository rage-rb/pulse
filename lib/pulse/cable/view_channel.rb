# frozen_string_literal: true

class Pulse::Cable::ViewChannel < Rage::Cable::Channel
  def subscribed
    Fiber[:__pulse_state] = {
      update: ->(payload) { transmit(payload) },
      interactive_components: nil,
      root_component: nil,
      cleanup: []
    }
  end

  def unsubscribed
    cleanup
  end

  # Single client -> server entrypoint. `type` distinguishes a page navigation from an
  # event dispatched to a specific component.
  def receive(data)
    case data["type"]
    when "navigate"
      navigate(data)
    when "event"
      handle_event(data)
    end
  end

  private

  # Dispatch an event to the component.
  def handle_event(data)
    pulse_id, event, params = data["id"].to_i, data["event"].to_sym, data["params"]
    component = Fiber[:__pulse_state][:interactive_components][pulse_id]

    unless component
      Rage.logger.debug("Couldn't find a component to handle event", component_id: pulse_id, event:)
      return
    end

    component.__handle_event(event, params, env:)
  end

  # Render a root component replacing the whole page.
  def navigate(data)
    cleanup

    env = build_request(data)
    _, response_headers, response_body = app.call(env)

    if location_url = response_headers["location"]
      transmit(action: "navigate", url: location_url)
    else
      transmit(action: "update", html: response_body[0])
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

  # Unsubscribe all pub/sub listeners, then drop the component registry.
  def cleanup
    state = Fiber[:__pulse_state]

    state[:root_component] = nil
    state[:cleanup].each(&:call).clear
  end
end
