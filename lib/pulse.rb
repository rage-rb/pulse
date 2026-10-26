# frozen_string_literal: true

module Pulse
  autoload :Component, "pulse/component"

  module Cable
    autoload :ViewChannel, "pulse/cable/view_channel"
  end

  module Phlex
    autoload :AutoId, "pulse/phlex/auto_id"
    autoload :EventHandlers, "pulse/phlex/event_handlers"
  end
end

require_relative "pulse/version"
require_relative "pulse/scripts"
require_relative "pulse/marker"
require_relative "pulse/tracking"
require_relative "pulse/fingerprint"
require_relative "pulse/rage_extension"
