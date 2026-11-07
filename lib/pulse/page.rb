# frozen_string_literal: true

class Pulse::Page
  def initialize(env, local_storage_snapshot)
    @env = env
    @local_storage_snapshot = local_storage_snapshot
  end

  def path
    @env["PATH_INFO"]
  end

  def navigate(url)
    @url = url
    Pulse.__state.server_events.update_page(self)
  end

  def query
    @query ||= Query.new(self, @env["QUERY_STRING"])
  end

  def local_storage
    @local_storage ||= LocalStorage.new(self, @local_storage_snapshot)
  end

  def url
    query_string = @env["QUERY_STRING"]

    if query_string.empty?
      path
    else
      "#{path}?#{query_string}"
    end
  end

  def __pulse_dump
    data = {}

    if @url
      data[:url] = @url
      @url = nil
    end

    if @query&.changed
      @query.changed = false
      data[:query] = @query.__pulse_dump
    end

    if @local_storage&.changed
      @local_storage.changed = false
      data[:local_storage] = @local_storage.__pulse_dump
    end

    data
  end

  class HashAccess
    attr_accessor :changed

    def initialize(page, data)
      @page = page
      @data = data
    end

    def [](key)
      @data[key]
    end

    def key?(key)
      @data.key?(key)
    end

    alias_method :has_key?, :key?

    def fetch(...)
      @data.fetch(...)
    end

    def delete(...)
      @data.delete(...).tap { trigger_change }
    end

    def update(...)
      @data.update(...).tap { trigger_change }
    end

    def []=(key, value)
      (@data[key] = value).tap { trigger_change }
    end

    def to_h
      @data
    end

    private

    def trigger_change
      @changed = true
      Pulse.__state.server_events.update_page(@page)
    end
  end

  class Query < HashAccess
    def initialize(page, query_string)
      super(
        page,
        query_string == "" ? {} : Iodine::Rack::Utils.parse_nested_query(query_string)
      )
    end

    def __pulse_dump
      Rack::Utils.build_nested_query(to_h)
    end
  end

  class LocalStorage < HashAccess
    def initialize(page, snapshot)
      super(
        page,
        snapshot ? JSON.parse(snapshot, symbolize_names: true) : {}
      )
    end

    def __pulse_dump
      JSON.dump(to_h)
    end
  end
end
