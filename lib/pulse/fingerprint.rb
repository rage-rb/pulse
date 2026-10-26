module Pulse::Fingerprint
  def self.included(klass)
    klass.extend ClassMethods
  end

  module ClassMethods
    def new(*args, **kwargs, &)
      instance = super
      instance.__record_pulse_inputs(args:, kwargs:)
      instance
    end
  end

  # @private
  def __record_pulse_inputs(args:, kwargs:)
    @__inputs = if args.any? && kwargs.any?
      args + kwargs.to_a
    elsif args.any?
      args
    else
      kwargs
    end
  end

  # Returns a content-based fingerprint for change detection.
  #
  # Used to determine if a component's inputs have changed since the last render.
  # If the fingerprint matches the stored fingerprint, re-rendering can be skipped.
  def fingerprint
    @__inputs.map { |input| calculate_fingerprint(input) }
  end

  private

  # Calculate fingerprint for different input types.
  # `hash` is used as a cheaper alternative to duplication in order to support in-place edits.
  # Active Record's dirty edits are not supported - it would require calling `changed?` or
  # `attributes`, which are very slow - doing this for every single component render
  # to support the minority of cases is not viable.
  def calculate_fingerprint(value)
    if value.is_a?(ActiveRecord::Base)
      value[:updated_at].nil? ? value.attributes.hash : [value.hash, value.updated_at]
    elsif value.is_a?(Hash)
      calculate_fingerprint(value.to_a)
    elsif value.is_a?(Array)
      value.map { |v| calculate_fingerprint(v) }
    else
      value.hash
    end
  end
end
