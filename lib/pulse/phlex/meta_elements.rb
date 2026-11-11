module Pulse::Phlex::MetaElements
  %i[doctype meta html head title style script].each do |method_name|
    define_method(method_name) do |**attributes, &block|
      if @__rerender
        # no-op
        block&.call if method_name == :html
      else
        super(**attributes, &block)
      end
    end
  end
end
