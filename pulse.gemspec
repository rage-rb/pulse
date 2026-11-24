# frozen_string_literal: true

require_relative "lib/pulse/version"

Gem::Specification.new do |spec|
  spec.name = "rage-pulse"
  spec.version = Pulse::VERSION
  spec.authors = ["Roman Samoilov"]
  spec.email = ["developers@rage-rb.dev"]

  spec.summary = "Stateful, reactive views for Ruby, built with Phlex and Rage"
  spec.homepage = "https://github.com/rage-rb/pulse"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.4.0"

  spec.metadata["source_code_uri"] = "https://github.com/rage-rb/pulse"

  # Specify which files should be added to the gem when it is released.
  # The `git ls-files -z` loads the files in the RubyGem that have been added into git.
  gemspec = File.basename(__FILE__)
  spec.files = IO.popen(%w[git ls-files -z], chdir: __dir__, err: IO::NULL) do |ls|
    ls.readlines("\x0", chomp: true).reject do |f|
      (f == gemspec) ||
        f.start_with?(*%w[bin/ Gemfile .gitignore .rspec spec/ .github/ .rubocop.yml js/ demo/])
    end
  end
  spec.files << "lib/pulse/assets/pulse.min.js"
  spec.bindir = "exe"
  spec.executables = spec.files.grep(%r{\Aexe/}) { |f| File.basename(f) }
  spec.require_paths = ["lib"]

  spec.add_dependency "globalid", "~> 1.4"
  spec.add_dependency "phlex", "~> 2.4"
  spec.add_dependency "prism", "~> 1.0"
  spec.add_dependency "rage-rb", "~> 1.29"
end
