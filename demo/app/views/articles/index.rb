class Articles::Index < Pulse::Component
  def initialize(articles:)
    @search = watch(Stores::Search)
    @articles = articles
  end

  def view_template
    filtered_articles = if (query = @search.query)
      @articles.where("title LIKE ? or body like ?", "%#{query}%", "%#{query}%")
    else
      @articles
    end

    render Layout.new(title: "Articles - CMS Admin") do
      div(class: "list") do
        div(class: "top-bar") do
          h1 { "Articles" }
          a(href: "/articles/new", class: "btn btn-primary") { "New Article" }
        end

        if filtered_articles.blank?
          div(class: "card empty-state") do
            p { "No articles yet." }
            a(href: "/articles/new", class: "btn btn-primary") { "Create your first article" }
          end
        else
          filtered_articles.each { |article| render Articles::Card.new(article:), key: article.id }
        end
      end
    end
  end
end
