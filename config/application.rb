require "bundler/setup"
require "rage"
Bundler.require(*Rage.groups)

require "active_record"
require "rage/all"

Rage.configure do
  config.middleware.use Rack::MethodOverride
  config.router.form_actions = true
  config.cable.protocol = :raw_websocket_json

  # Renders a Phlex component to HTML. This serves the initial (JS-less) page load
  # and direct URL visits; once the WebSocket is connected, the client drives all
  # rendering over the socket via LiveChannel instead.
  config.renderer :phlex do |component, **props|
    component_instance = component.new(**props)
    Fiber[:live_state][:root_component] ||= component_instance if Fiber[:live_state]
    headers["content-type"] = "text/html"
    component_instance.call
  end
end

require "rage/setup"
