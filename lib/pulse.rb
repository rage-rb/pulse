# frozen_string_literal: true

module Pulse
  module Cable
    autoload :Channel, "pulse/cable/channel"
  end

  module Phlex
    autoload :AutoId, "pulse/phlex/auto_id"
    autoload :EventHandlers, "pulse/phlex/event_handlers"
  end
end

require_relative "pulse/version"
require_relative "pulse/scripts"
require_relative "pulse/component"
