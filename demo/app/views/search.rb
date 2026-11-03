class Search < Pulse::Component
  def initialize
    @search = watch(Stores::Search)
  end

  def view_template
    div(class: "navbar-search", role: "search") do
      input(
        type: "search",
        input: :set_search,
        name: "q",
        class: "navbar-search-input",
        placeholder: "Search articles…",
        aria_label: "Search articles"
      )
    end
  end

  def set_search(event)
    @search.query = event.value
  end
end
