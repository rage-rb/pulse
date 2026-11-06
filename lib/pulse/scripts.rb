# frozen_string_literal: true

require "digest"

##
# Phlex mixin that emits the Pulse client. Include it in your layout and call
# `pulse_scripts` in <head> or at the end of <body>.
#
# The client is served from the gem by `Pulse::RageExtension` under a fingerprinted URL,
# so browsers can cache it indefinitely.
#
module Pulse::Scripts
  JAVASCRIPT_PATH = File.expand_path("assets/pulse.min.js", __dir__)
  MOUNT_PATH = "/__pulse/scripts"

  HEADERS = {
    "content-type" => "text/javascript; charset=utf-8",
    "cache-control" => "public, max-age=31536000, immutable"
  }

  class << self
    # @private
    def call(_)
      [200, HEADERS.dup, [script]]
    end

    # @return [String] the fingerprinted URL of the client bundle
    def url
      @url ||= begin
        digest = Digest::SHA256.hexdigest(script)[0, 16]
        "#{MOUNT_PATH}/pulse-#{digest}.js"
      end
    end

    private

    def script
      @script ||= File.binread(JAVASCRIPT_PATH)
    end
  end

  def pulse_scripts
    script(src: Pulse::Scripts.url, defer: true)
  end
end
