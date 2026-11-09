# frozen_string_literal: true

class Pulse::Store
  class << self
    def attribute(name, default: nil)
      define_method(name) { attributes.fetch(name, default) }

      define_method "#{name}=" do |value|
        attributes[name] = value

        components.each do |component, block|
          block&.call
          component.replace
        end

        value
      end
    end
  end

  def __register_component(component, &block)
    components[component] = block
  end

  def __unregister_component(component)
    components.delete(component)
  end

  private

  def attributes
    @attributes ||= {}
  end

  def components
    @components ||= {}
  end
end
