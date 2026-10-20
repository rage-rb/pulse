module Pulse::Identity
  def self.included(klass)
    klass.extend ClassMethods
  end

  module ClassMethods
    # Declares which attributes define this component's identity.
    #
    # @param args [Array<Symbol, String>] Instance variables (e.g., `:@article`) or
    #   method names to use for identity/fingerprint calculation.
    # @raise [ArgumentError] If a method name is provided that doesn't exist.
    #
    # @example
    #   identify_by :@article
    #   identify_by :@article, :@show_actions
    #
    def identify_by(*args)
      args.each do |arg|
        unless arg.start_with?("@") || instance_method(arg)
          raise ArgumentError, "#{self}##{arg} is not defined. Use an instance variable (e.g., :@#{arg}) or define the method."
        end
      end

      args_identity_elements = args.map { |arg| "#{arg}" }.join(", ")
      args_fingerprint_elements = args.map { |arg| "process_fingerprint(#{arg})" }.join(", ")

      class_eval <<~RUBY, __FILE__, __LINE__ + 1
        protected def identity = [self.class, #{args_identity_elements}]
        protected def fingerprint = [#{args_fingerprint_elements}]
      RUBY
    end
  end

  protected

  # Returns the component's identity for reconciliation lookup.
  #
  # Used to find existing components by comparing object references.
  # Two components with the same identity are considered the "same" component across renders.
  def identity
    instance_variables.each_with_object([self.class]) do |ivar, memo|
      memo << instance_variable_get(ivar) unless ivar.start_with?("@_")
    end
  end

  # Returns a content-based fingerprint for change detection.
  #
  # Used to determine if a component's inputs have changed since the last render.
  # If the fingerprint matches the stored fingerprint, re-rendering can be skipped.
  def fingerprint
    instance_variables.filter_map do |ivar|
      unless ivar.start_with?("@_")
        process_fingerprint(instance_variable_get(ivar))
      end
    end
  end

  private

  # Processes a value into a comparable fingerprint representation.
  def process_fingerprint(value)
    if value.is_a?(ActiveRecord::Base)
      [value.class, value.attributes.hash]
    elsif value.is_a?(Hash)
      process_fingerprint(value.to_a)
    elsif value.is_a?(Array)
      value.map { |v| process_fingerprint(v) }
    else
      value.hash
    end
  end
end
