# frozen_string_literal: true

require_relative "lib/pulse/version"

Gem::Specification.new do |spec|
  spec.name = "pulse"
  spec.version = Pulse::VERSION
  spec.authors = ["Roman Samoilov"]
  spec.email = ["2270393+rsamoilov@users.noreply.github.com"]

  spec.summary = "Write a short summary, because RubyGems requires one."
  spec.description = "Write a longer description or delete this line."
  # spec.homepage = "Put your gem's website or public repo URL here."
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.2.0"

  spec.metadata["allowed_push_host"] = "Set to your gem server 'https://example.com'"
  # spec.metadata["source_code_uri"] = "Put your gem's public repo URL here."
  # spec.metadata["changelog_uri"] = "Put your gem's CHANGELOG.md URL here."

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

  spec.add_dependency "rage-rb", "~> 1.26"
  spec.add_dependency "globalid", "~> 1.4"
end
