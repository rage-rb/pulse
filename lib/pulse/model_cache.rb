# frozen_string_literal: true

class Pulse::ModelCache
  class << self
    def store
      @store ||= {}
    end

    def fetch(gid)
      store.fetch(gid) do
        model = begin
          GlobalID::Locator.locate(gid)
        rescue ActiveRecord::RecordNotFound
        end

        Fiber.schedule do
          sleep 0
          store.delete(gid)
        end

        store[gid] = model
      end
    end
  end
end
