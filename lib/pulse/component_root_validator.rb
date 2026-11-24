# frozen_string_literal: true

require "phlex"
require "prism"

class Pulse::ComponentRootValidator < Prism::Visitor
  PHLEX_TAG_METHODS = Set.new(
    Phlex::HTML::StandardElements.instance_methods(false) +
      Phlex::HTML::VoidElements.instance_methods(false) +
      [:tag]
  ).freeze
  NON_ROOT_TAG_METHODS = Set.new(%i[head meta title style script]).freeze
  ROOT_TAG_METHODS = (PHLEX_TAG_METHODS - NON_ROOT_TAG_METHODS).freeze
  OUTPUT_METHODS = (PHLEX_TAG_METHODS + %i[comment doctype plain raw render whitespace]).freeze

  Diagnostic = Data.define(:path, :line, :scope, :roots, :unwrapped_output, :early_returns) do
    def message
      "#{path}:#{line}: #{problem}"
    end

    private

    def problem
      [root_problem, early_return_problem].compact.join(" ")
    end

    def root_problem
      if roots.one?
        return if unwrapped_output.empty?

        root = roots.first
        "#{describe(unwrapped_output)} #{verb(unwrapped_output)} rendered outside " \
          "the root #{describe(roots)} in #{scope_name}; move #{unwrapped_output.one? ? "it" : "them"} " \
          "inside the `#{root.name}`."
      elsif roots.any?
        both = (roots.length == 2) ? "both" : "all"
        outside = unwrapped_output.any? ? ", and #{describe(unwrapped_output)} #{verb(unwrapped_output)} also rendered outside them" : ""

        "#{describe(roots)} are #{both} top-level in #{scope_name}#{outside}; wrap them in one element."
      elsif unwrapped_output.any?
        "#{scope_name.capitalize} has no root element wrapping #{describe(unwrapped_output)}; " \
          "render one element at the top level and put all output inside it."
      else
        "#{scope_name.capitalize} renders no root element; render one element that wraps all of its content."
      end
    end

    def early_return_problem
      return if early_returns.empty?

      "#{describe(early_returns)} can exit #{scope_name} before its root #{describe(roots)}; " \
        "move the conditional inside the root."
    end

    def verb(nodes)
      nodes.one? ? "is" : "are"
    end

    def scope_name
      (scope == "view_template") ? "`view_template`" : "this render block"
    end

    def describe(nodes)
      descriptions = nodes.map do |node|
        name = case node
        when Prism::ReturnNode then "return"
        when Prism::YieldNode then "yield"
        else node.name
        end
        "`#{name}` (line #{node.location.start_line})"
      end

      return descriptions.first if descriptions.one?

      "#{descriptions[0...-1].join(", ")} and #{descriptions.last}"
    end
  end

  class ReturnCollector < Prism::Visitor
    attr_reader :returns

    def initialize
      @returns = []
      super
    end

    def visit_def_node(_node)
      # A return in a nested method cannot exit the component template.
    end

    def visit_lambda_node(_node)
      # A return in a lambda exits the lambda, not the component template.
    end

    def visit_return_node(node)
      @returns << node
    end
  end

  class OutputCollector < Prism::Visitor
    attr_reader :output

    def initialize
      @output = []
      super
    end

    def visit_call_node(node)
      if output?(node)
        @output << node
        return
      end

      super
    end

    def visit_yield_node(node)
      @output << node
    end

    private

    def output?(node)
      phlex_call?(node) && OUTPUT_METHODS.include?(node.name)
    end

    def phlex_call?(node)
      node.receiver.nil? || node.receiver.is_a?(Prism::SelfNode)
    end
  end

  def self.call(components)
    locations = components.map do |klass|
      location, _ = Object.const_source_location(klass.name)
      location
    end

    locations.sort.flat_map do |location|
      result = Prism.parse_file(location)
      next [] unless result.success?

      validator = new(Pathname.new(location).relative_path_from(Rage.root))
      result.value.accept(validator)
      validator.diagnostics
    end
  end

  def self.validate(*components)
    diagnostics = call(components)
    return if diagnostics.empty?

    message = diagnostics.map { |diagnostic| "  - #{diagnostic.message}" }.join("\n")

    "Every Pulse component and `render` block must wrap its output in exactly one root element. " \
    "Found #{diagnostics.length} #{diagnostics.one? ? "problem" : "problems"}:\n#{message}"
  end

  def self.validate!(*components)
    error_message = validate(*components)
    raise Pulse::InvalidComponentRootError, error_message if error_message
  end

  attr_reader :diagnostics

  def initialize(path)
    @path = path
    @diagnostics = []
    super()
  end

  def visit_def_node(node)
    validate_scope(node.body, node.location.start_line, "view_template") if node.name == :view_template
    super
  end

  def visit_call_node(node)
    if node.name == :render && node.block && phlex_call?(node)
      validate_scope(node.block.body, node.location.start_line, "render block")
    end

    super
  end

  private

  def validate_scope(node, line, scope)
    statements = node.is_a?(Prism::StatementsNode) ? node.body : Array(node)
    roots = statements.select { |statement| root?(statement) }
    unwrapped_output = statements.flat_map do |statement|
      next [] if roots.include?(statement)
      next [] if allowed_document_output?(statement, roots)

      collector = OutputCollector.new
      statement.accept(collector)
      collector.output
    end
    early_returns = early_returns(statements, roots)

    return if roots.one? && unwrapped_output.empty? && early_returns.empty?

    @diagnostics << Diagnostic.new(
      path: @path,
      line:,
      scope:,
      roots:,
      unwrapped_output:,
      early_returns:
    )
  end

  def early_returns(statements, roots)
    return [] unless roots.one?

    collector = ReturnCollector.new
    statements.take_while { |statement| statement != roots.first }.each do |statement|
      statement.accept(collector)
    end
    collector.returns
  end

  def root?(node)
    return false unless node.is_a?(Prism::CallNode) && phlex_call?(node)

    ROOT_TAG_METHODS.include?(node.name) || (node.name == :render && node.block)
  end

  def allowed_document_output?(node, roots)
    return false unless node.is_a?(Prism::CallNode) && phlex_call?(node) && roots.one?

    root_name = roots.first.name
    (node.name == :doctype && %i[body html].include?(root_name)) ||
      (node.name == :head && root_name == :body)
  end

  def phlex_call?(node)
    node.receiver.nil? || node.receiver.is_a?(Prism::SelfNode)
  end

  private_constant :NON_ROOT_TAG_METHODS, :OUTPUT_METHODS, :PHLEX_TAG_METHODS, :ROOT_TAG_METHODS
end
