module Pulse::Phlex::EventHandlers
  %i[a button].each do |method_name|
    define_method method_name do |click: nil, **attributes, &block|
      return super(**attributes, &block) unless click

      component_id = object_id
      event_name, params = click

      if (pulse_state = Fiber[:__pulse_state])
        pulse_state[:interactive_components] ||= ObjectSpace::WeakMap.new
        pulse_state[:interactive_components][component_id] = self
      end

      attributes = attributes.merge({
        data_pulse_click: event_name.to_s,
        data_pulse_component_id: component_id,
        data_pulse_params: params&.to_json
      })

      super(**attributes, &block)
    end
  end
end
