module Pulse::Tracking
  def track(model, &block)
    unless model.is_a?(ActiveRecord::Base)
      raise ArgumentError, "should be an Active Record model"
    end

    pulse_state = Fiber[:__pulse_state]
    return model unless pulse_state

    wrapped = SimpleDelegator.new(model)

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

    Fiber[:__pulse_state][:cleanup] << -> { Rage::PubSub.unsubscribe(topic: model, subscription_id: self) }

    wrapped
  end

  def self.broadcast(model)
    unless model.is_a?(ActiveRecord::Base)
      raise ArgumentError, "should be an Active Record model"
    end

    Rage::PubSub.publish(model.to_global_id(app: "pulse").to_s, topic: model)
  end
end
