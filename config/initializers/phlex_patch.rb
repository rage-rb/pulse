body_content_elements = Phlex::HTML::StandardElements.instance_methods + %i[tag] - %i[html head body title style]

module AutoLiveId
end

body_content_elements.each do |method_name|
  AutoLiveId.define_method(method_name) do |**attributes, &block|
    if @_pending_live_id
      # TODO: users setting IDs manually will prevent events handlers
      # from being called via `Fiber[:live_state][:components][live_id]`
      attributes[:id] = live_id unless attributes.has_key?(:id)
      @_pending_live_id = false
    end

    super(**attributes, &block)
  end
end

Phlex::HTML.prepend(AutoLiveId)
