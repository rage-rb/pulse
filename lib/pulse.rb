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
