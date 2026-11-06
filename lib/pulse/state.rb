# frozen_string_literal: true

class Pulse::State
  attr_accessor :root_component

  def initialize(env, write_closure)
    @env = env
    @write_closure = write_closure
  end

  def live?
    !!@write_closure
  end

  def interactive_components
    @interactive_components ||= ObjectSpace::WeakMap.new
  end

  def stores
    @stores ||= {}
  end

  def server_events
    @events ||= Pulse::ServerEvents.new(@write_closure)
  end

  def schedule_cleanup(actor, &block)
    @cleanup ||= {}
    prev_cleanup = @cleanup[actor]

    @cleanup[actor] = -> do
      prev_cleanup&.call
      block.call
    end
  end

  def run_cleanup(actor)
    @cleanup&.delete(actor)&.call
  end

  def reload
    @root_component = @stores = nil
    @cleanup&.each_value(&:call)&.clear
  end
end
