module Pulse::Identity
  def self.included(klass)
    klass.extend ClassMethods
  end

  module ClassMethods
    # Declares which attributes define this component's identity.
    #
    # @param args [Array<Symbol, String>] Instance variables (e.g., `:@article`) or
    #   method names to use for identity calculation.
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

      class_eval <<~RUBY, __FILE__, __LINE__ + 1
        def identity = [self.class, #{args_identity_elements}]
      RUBY
    end
  end

  # Returns the component's identity for reconciliation lookup.
  #
  # Used to find existing components by comparing object references.
  # Two components with the same identity are considered the "same" component across renders.
  def identity
    instance_variables.each_with_object([self.class]) do |ivar, memo|
      memo << instance_variable_get(ivar) unless ivar.start_with?("@_")
    end
  end
end
