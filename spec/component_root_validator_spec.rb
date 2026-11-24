# frozen_string_literal: true

require "tmpdir"

RSpec.describe Pulse::ComponentRootValidator do
  around do |example|
    Dir.mktmpdir("pulse-component-root-validator") do |directory|
      @source_directory = Pathname(directory)
      example.run
    end
  end

  def load_source(filename, source)
    path = @source_directory.join(filename)
    path.write(source)
    load path.to_s
  end

  def validate(source)
    load_source("component.rb", source)
    class_name = source.match(/class (\w+) < Pulse::Component/)[1].to_sym
    component_class = Object.const_get(class_name)
    described_class.validate!(component_class)
  ensure
    Object.send(:remove_const, class_name)
  end

  context "with valid component roots" do
    it "accepts one direct root containing nested output" do
      source = <<~RUBY
        class Card < Pulse::Component
          def view_template
            title = expanded? ? "Expanded" : "Collapsed"

            article do
              h1 { title }
              items.each { |item| p { item } }
              plain "Footer" if footer?
            end
          end
        end
      RUBY

      expect { validate(source) }.not_to raise_error
    end

    it "accepts a direct block-form render whose block has one direct root" do
      source = <<~RUBY
        class Page < Pulse::Component
          def view_template
            render Layout.new do
              main do
                h1 { "Page" }
              end
            end
          end
        end
      RUBY

      expect { validate(source) }.not_to raise_error
    end

    it "accepts a full HTML document" do
      source = <<~RUBY
        class Layout < Pulse::Component
          def view_template
            doctype
            html do
              head { title { "Pulse" } }
              body { yield }
            end
          end
        end
      RUBY

      expect { validate(source) }.not_to raise_error
    end

    it "accepts direct head and body elements for a full document" do
      source = <<~RUBY
        class Layout < Pulse::Component
          def view_template
            doctype
            head { title { "Pulse" } }
            body { yield }
          end
        end
      RUBY

      expect { validate(source) }.not_to raise_error
    end

    it "accepts explicit self and dynamic tag roots" do
      source = <<~RUBY
        class Card < Pulse::Component
          def view_template
            self.tag(:article) { plain "Card" }
          end
        end
      RUBY

      expect { validate(source) }.not_to raise_error
    end

    it "accepts no view_template" do
      source = <<~RUBY
        class Card < Pulse::Component
          def view_template
            self.tag(:article) { plain "Card" }
          end
        end
      RUBY

      expect { validate(source) }.not_to raise_error
    end
  end

  context "with invalid component roots" do
    it "rejects an early return before the root" do
      source = <<~RUBY
        class Card < Pulse::Component
          def view_template
            return unless @visible

            div { "Card" }
          end
        end
      RUBY

      expect { validate(source) }.to raise_error(Pulse::InvalidComponentRootError)
    end

    it "rejects an empty template" do
      source = <<~RUBY
        class Empty < Pulse::Component
          def view_template
          end
        end
      RUBY

      expect { validate(source) }.to raise_error(Pulse::InvalidComponentRootError)
    end

    it "rejects multiple direct roots" do
      source = <<~RUBY
        class Card < Pulse::Component
          def view_template
            h1 { "Title" }
            div { "Body" }
          end
        end
      RUBY

      expect { validate(source) }.to raise_error(Pulse::InvalidComponentRootError)
    end

    it "rejects a root inside a conditional" do
      source = <<~RUBY
        class Card < Pulse::Component
          def view_template
            div { "Card" } if visible?
          end
        end
      RUBY

      expect { validate(source) }.to raise_error(Pulse::InvalidComponentRootError)
    end

    it "rejects a root inside an iterator" do
      source = <<~RUBY
        class List < Pulse::Component
          def view_template
            items.each { |item| div { item } }
          end
        end
      RUBY

      expect { validate(source) }.to raise_error(Pulse::InvalidComponentRootError)
    end

    it "rejects a root assigned to a variable" do
      source = <<~RUBY
        class Card < Pulse::Component
          def view_template
            root = div { "Card" }
          end
        end
      RUBY

      expect { validate(source) }.to raise_error(Pulse::InvalidComponentRootError)
    end

    it "rejects a non-morphable root tag" do
      source = <<~RUBY
        class Styles < Pulse::Component
          def view_template
            style { raw css }
          end
        end
      RUBY

      expect { validate(source) }.to raise_error(Pulse::InvalidComponentRootError)
    end

    it "rejects multiple roots in a render block" do
      source = <<~RUBY
        class Page < Pulse::Component
          def view_template
            render Layout.new do
              h1 { "Page" }
              div { "Body" }
            end
          end
        end
      RUBY

      expect { validate(source) }.to raise_error(Pulse::InvalidComponentRootError)
    end

    it "validates render blocks outside view_template" do
      source = <<~RUBY
        class Page < Pulse::Component
          def view_template
            main { content }
          end

          def content
            render Card.new do
              h1 { "Card" }
              div { "Body" }
            end
          end
        end
      RUBY

      expect { validate(source) }.to raise_error(Pulse::InvalidComponentRootError)
    end

    {
      "plain text" => 'plain "Text"',
      "raw HTML" => 'raw "<span>Text</span>"',
      "a comment" => 'comment { "Text" }',
      "whitespace" => "whitespace",
      "yielded content" => "yield",
      "a component rendered without a block" => "render Child.new",
      "a conditional element" => 'div { "Extra" } if extra?'
    }.each do |description, output|
      it "rejects #{description} alongside the root" do
        source = <<~RUBY
          class Card < Pulse::Component
            def view_template
              article { "Card" }
              #{output}
            end
          end
        RUBY

        expect { validate(source) }.to raise_error(Pulse::InvalidComponentRootError)
      end
    end
  end

  it "rejects violations across source files" do
    load_source("empty.rb", <<~RUBY)
      class Empty < Pulse::Component
        def view_template
        end
      end
    RUBY

    load_source("siblings.rb", <<~RUBY)
      class Siblings < Pulse::Component
        def view_template
          h1 { "Title" }
          div { "Body" }
        end
      end
    RUBY

    expect {
      described_class.validate!(Siblings, Empty)
    }.to raise_error(Pulse::InvalidComponentRootError, /Found 2 problems/)
  ensure
    Object.send(:remove_const, :Empty)
    Object.send(:remove_const, :Siblings)
  end
end
