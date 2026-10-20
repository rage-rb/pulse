require "bundler/setup"
require "rage"
Bundler.require(*Rage.groups)

require "active_record"
require "rage/all"

Rage.configure do
end

require "rage/setup"
