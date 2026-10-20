# frozen_string_literal: true

require "bundler/gem_tasks"
require "rspec/core/rake_task"

RSpec::Core::RakeTask.new(:spec)

require "rubocop/rake_task"

RuboCop::RakeTask.new

JAVASCRIPT_BUNDLE = "lib/pulse/assets/pulse.min.js"
JAVASCRIPT_INPUTS = Rake::FileList[
  "js/src/**/*.ts",
  "js/package.json",
  "js/package-lock.json",
  "js/tsconfig.json"
]

file JAVASCRIPT_BUNDLE => JAVASCRIPT_INPUTS do
  mkdir_p File.dirname(JAVASCRIPT_BUNDLE)

  Dir.chdir("js") do
    sh "npm", "ci"
    sh "npm", "run", "build"
  end
end

task build: JAVASCRIPT_BUNDLE

# make `rake clean` remove the bundle
CLEAN.include(JAVASCRIPT_BUNDLE)

task default: %i[spec rubocop]
