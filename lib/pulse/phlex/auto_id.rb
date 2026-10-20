module Pulse::Phlex::AutoId
  body_content_elements = Phlex::HTML::StandardElements.instance_methods + %i[tag] - %i[html head body title style]

  body_content_elements.each do |method_name|
    define_method(method_name) do |**attributes, &block|
      if @__pending_pulse_id
        # TODO: users setting IDs manually will prevent events handlers
        # from being called via `Fiber[:__pulse_state]`
        attributes = attributes.merge(id: pulse_id) unless attributes.has_key?(:id)
        @__pending_pulse_id = false
      end

      super(**attributes, &block)
    end
  end
end
