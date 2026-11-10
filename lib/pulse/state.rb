# frozen_string_literal: true

class Pulse::State
  attr_accessor :root_component
  attr_reader :local_storage_snapshot, :query_snapshot, :url

  def initialize(write_closure)
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

  def page
    @page ||= Pulse::Page.new(self)
  end

  def local_storage_snapshot=(local_storage_snapshot)
    @local_storage_snapshot = local_storage_snapshot
    @page = nil
  end

  def query_snapshot=(query_snapshot)
    @query_snapshot = query_snapshot
    @page = nil
  end

  def url=(url)
    @url = url
    @page = nil
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
