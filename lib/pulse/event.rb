# frozen_string_literal: true

class Pulse::Event
  def initialize(data)
    @data = data
  end

  def value
    @data["value"]
  end

  def checked?
    @data["checked"]
  end

  def form_data
    return @form_data if @form_data

    form = @data["form"]
    return unless form

    @form_data = Rage::ParamsParser.prepare({
      "IODINE_HAS_BODY" => true,
      "QUERY_STRING" => "",
      "CONTENT_TYPE" => "application/x-www-form-urlencoded",
      "rack.input" => StringIO.new(form)
    }, {})
  end
end
