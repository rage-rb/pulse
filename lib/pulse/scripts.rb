# frozen_string_literal: true

##
# Phlex mixin that emits the Pulse client. Include it in your layout and call
# `pulse_scripts` at the end of <body>.
#
module Pulse::Scripts
  JAVASCRIPT_PATH = File.expand_path("assets/pulse.min.js", __dir__)

  def pulse_scripts
    js = File.read(JAVASCRIPT_PATH).gsub(%r{</script}i) { "<\\/script" }
    script { raw(safe(js)) }
  end
end
