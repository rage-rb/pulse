module Pulse::Phlex::EventHandlers
  elements = Phlex::HTML::StandardElements.instance_methods +
    Phlex::HTML::VoidElements.instance_methods -
    %i[html head title style]

  elements.each do |method_name|
    define_method method_name do |click: nil, input: nil, change: nil, submit: nil, keydown: nil, keyup: nil, **attributes, &block|
      return super(**attributes, &block) unless click || input || change || submit || keydown || keyup

      attributes = attributes.merge(on(:click, click)) if click
      attributes = attributes.merge(on(:input, input)) if input
      attributes = attributes.merge(on(:change, change)) if change
      attributes = attributes.merge(on(:submit, submit)) if submit
      attributes = attributes.merge(on(:keydown, keydown)) if keydown
      attributes = attributes.merge(on(:keyup, keyup)) if keyup

      Pulse.__state.interactive_components[__component_id] = self if Pulse.__state.live?

      super(**attributes, &block)
    end
  end

  def on(event, handler, key: nil, debounce: nil, throttle: nil)
    if debounce || throttle
      raise ArgumentError, "`#{event}` handler can't use both `debounce` and `throttle`" if debounce && throttle
      raise ArgumentError, "`#{event}` handler `debounce` must be a positive number of milliseconds" if debounce.to_i < 0
      raise ArgumentError, "`#{event}` handler `throttle` must be a positive number of milliseconds" if throttle.to_i < 0
    end

    raise ArgumentError, "`#{event}` can't use `key`" if key && event != :keyup && event != :keydown

    options = { "data-pulse-#{event}" => handler.to_s, "data-pulse-component-id" => __component_id }
    options["data-pulse-#{event}-debounce"] = debounce if debounce
    options["data-pulse-#{event}-throttle"] = throttle if throttle
    options["data-pulse-#{event}-key"] = key if key

    options
  end

  private

  # stable key for the weak map that is safe to compare by identity
  def __component_id
    object_id
  end
end
