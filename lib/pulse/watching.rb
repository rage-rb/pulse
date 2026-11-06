module Pulse::Watching
  def self.broadcast(model)
    unless model.is_a?(ActiveRecord::Base)
      raise ArgumentError, "should be an Active Record model"
    end

    Rage::PubSub.publish(model.to_global_id(app: "pulse").to_s, topic: model)
  end

  def watch(object, &)
    if object.is_a?(ActiveRecord::Base)
      watch_model(object, &)
    elsif (object.is_a?(Class) && object <= Pulse::Store) || object.is_a?(Pulse::Store)
      watch_store(object, &)
    else
      raise ArgumentError, "should be an Active Record model or an instance of Pulse::Store"
    end
  end

  private

  def watch_model(model, &block)
    pulse_state = Pulse.__state
    return model unless pulse_state.live?

    wrapped = SimpleDelegator.new(model)

    __add_subscription do
      Rage::PubSub.subscribe(topic: model, subscription_id: self) do |gid|
        Fiber.schedule do
          Fiber[:__pulse_state] = pulse_state

          new_model = begin
            GlobalID::Locator.locate(gid)
          rescue ActiveRecord::RecordNotFound
          end

          wrapped.__setobj__(new_model)
          block&.call(new_model)
          new_model.nil? ? remove : replace

        rescue => e
          Rage.logger.error("#{e.class} (#{e.message}):\n#{e.backtrace.join("\n")}")
          Rage::Errors.report(e)
        end
      end

      pulse_state.schedule_cleanup(self) do
        Rage::PubSub.unsubscribe(topic: model, subscription_id: self)
      end
    end

    wrapped
  end

  def watch_store(store_or_class, &block)
    unless Pulse.__state.live?
      return store_or_class.is_a?(Class) ? store_or_class.new : store_or_class
    end

    store = if store_or_class.is_a?(Class)
      Pulse.__state.stores[store_or_class] ||= store_or_class.new
    else
      store_or_class
    end

    __add_subscription do
      store.__register_component(self, &block)

      Pulse.__state.schedule_cleanup(self) do
        store.__unregister_component(self)
      end
    end

    store
  end

  def __add_subscription(&block)
    (@__subscriptions ||= []) << block
  end

  def __activate_subscriptions
    if @__subscriptions
      @__subscriptions&.each(&:call)
      @__subscriptions = nil
    end
  end

  protected

  def __cleanup_subscriptions
    Pulse.__state.run_cleanup(self)
  end
end
