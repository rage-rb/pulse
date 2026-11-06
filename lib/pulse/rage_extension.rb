# frozen_string_literal: true

class Pulse::RageExtension < Rage::Extension
  configure do
    config.router.form_actions = true

    config.renderer :phlex do |component, **props|
      component_instance = component.new(**props)
      Pulse.__state.root_component ||= component_instance
      headers["content-type"] = "text/html"
      component_instance.call
    end
  end

  initializer do
    Pulse::Component.prepend(Pulse::Phlex::AutoId)
    Pulse::Component.prepend(Pulse::Phlex::EventHandlers)
  end

  routes do
    mount Rage::Cable.application(namespace: Pulse::Cable, protocol: :raw_websocket_json), at: "__pulse"
    mount Pulse::Scripts, at: Pulse::Scripts::MOUNT_PATH, via: :get
  end
end
