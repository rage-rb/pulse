# Pulse

Stateful, reactive, server-rendered views for Ruby, built with [Phlex](https://github.com/yippee-fun/phlex) and [Rage](https://github.com/rage-rb/rage).

> [!NOTE]
> **Pulse is in active development. Its API may change.**

Pulse keeps Phlex component instances alive for the lifetime of a WebSocket connection. Browser events call ordinary Ruby methods, transient UI state stays in the component, and updates are rendered as HTML and morphed into the page.

```ruby
# app/controllers/articles_controller.rb
class ArticlesController < ApplicationController
  def show
    article = Article.find(params[:id])
    render phlex: Articles::Card, article: article # <-- render the component
  end
end

# app/views/articles/card.rb
class Articles::Card < Pulse::Component
  def initialize(article:)
    @article = article
    @expanded = false
  end

  def view_template
    div do
      button(click: :toggle_details) do # <-- set up the event handler
        @expanded ? "Show less" : "Show more"
      end

      p { @expanded ? @article.body : @article.body.truncate(150) }
    end
  end

  def toggle_details
    @expanded = !@expanded # <-- update local state and re-render
  end
end
```

Clicking the button calls `toggle_details` on that exact `Articles::Card` instance, then Pulse re-renders and patches the component in place. `@expanded` is a plain instance variable: it stays in the component for as long as the user keeps the page open.

No database column, query parameter, JSON API, or hand-written JavaScript is needed to remember whether the article is expanded.

## Why Pulse?

- **State is instance variables.** Instance variables hold the state, and public methods handle events.
- **Views are Phlex components.** Composition, inheritance, private methods, and ordinary Ruby all work as expected.
- **One fiber per connection.** Rage runs each WebSocket connection in its own fiber. Components live in that fiber.
- **Works with your controllers.** Links and forms still go to regular controller actions. Use components for view logic and controllers for business logic, or build everything in components. Both work.

Pulse preserves standard Phlex syntax. Event handlers are element attributes such as `click: :toggle`, and `key:` is available when rendering nested components whose identity must survive a parent re-render.

## Quick start

### Add the client to the page

Call `pulse_scripts` once in the component that renders the full HTML document:

```ruby
class Layout < Pulse::Component
  def view_template
    doctype

    html do
      head do
        title { "My application" }
      end

      body do
        main { yield }
        pulse_scripts
      end
    end
  end
end
```

The helper loads Pulse's fingerprinted client bundle. The client opens the WebSocket, enhances same-origin navigation, and applies HTML updates from the server.

### Render a component from a controller

Pulse uses Rage's `phlex` renderer:

```ruby
class ArticlesController < ApplicationController
  def index
    render phlex: Articles::Index, articles: Article.order(id: :desc)
  end
end
```

The rendered class can compose a layout and other components in normal Phlex code:

```ruby
class Articles::Index < Pulse::Component
  def initialize(articles:)
    @articles = articles
  end

  def view_template
    render Layout.new do
      div do
        h1 { "Articles" }
  
        @articles.each do |article|
          render Articles::Card.new(article: article), key: article.id
        end
      end
    end
  end
end
```

## How it works

1. A normal HTTP request is routed to a Rage controller and rendered with Phlex.
2. The Pulse client opens one WebSocket for the browser tab.
3. Pulse renders the current route again inside the connection's fiber, creating the live component tree.
4. Component events are dispatched to methods on the retained instances.
5. The changed component renders HTML, which the client morphs into the existing DOM.
6. Links, forms, redirects, and history navigation are routed through the same controllers over the connection.

Phlex supplies the view objects and rendering syntax. Rage supplies the connection handling and fiber-based concurrency. Pulse connects them with event dispatch, component identity, subscriptions, and HTML updates.

## Components and events

Event handlers are public methods defined on a `Pulse::Component`. After a handler returns, Pulse automatically replaces that component unless the handler performed another targeted update itself.

```ruby
class Search < Pulse::Component
  def initialize
    @query = ""
  end

  def view_template
    input(
      type: "search",
      value: @query,
      input: :set_query,
      placeholder: "Search articles…"
    )
  end

  def set_query(event)
    @query = event.value
  end
end
```

Pulse supports `click`, `input`, `change`, `submit`, `keydown`, and `keyup` handlers. A handler can take an optional event argument:

```ruby
def search(event)
  @query = event.value
end
```

| Method              | Returns                                       |
| ------------------- | --------------------------------------------- |
| `event.value`       | the element's value                           |
| `event.checked?`    | whether a checkbox or radio is checked        |
| `event.form_data`   | parsed form fields                            |

## Controllers, links, and forms

Business operations don't have to live in components. Same-origin links and forms are sent through the WebSocket and dispatched to the same Rage routes and controllers as ordinary HTTP requests.

```ruby
# app/controllers/articles_controller.rb
class ArticlesController < ApplicationController
  def create
    article = Article.create!(title: params[:title], body: params[:body])
    redirect_to "/articles/#{article.id}"
  end
end

# app/views/articles/create.rb
class Articles::Create < Pulse::Component
  def view_template
    render Layout.new do
      div do
        h1 { "New article" }
  
        form(method: "post", action: "/articles") do # <-- goes to ArticlesController#create
          label(for: "title") { "Title" }
          input(type: "text", id: "title", name: "title")
  
          label(for: "body") { "Body" }
          textarea(id: "body", name: "body")
  
          button(type: "submit") { "Create article" }
        end
      end
    end
  end
end
```

The controller doesn't know anything about Pulse. It reads `params`, does its job, then renders or redirects as usual, and Pulse updates the page without a full reload.

## Nested components and keys

Pulse can preserve unchanged nested component instances when their parent re-renders. In a collection, pass a stable `key` to `render` so Pulse can associate each new declaration with the existing component:

```ruby
class Articles::MostViewed < Pulse::Component
  def initialize(articles:)
    @articles = articles
  end

  def view_template
    div do
      @articles.each do |article|
        render Articles::Card.new(article: article), key: article.id
      end
    end
  end
end
```

## Shared state

Use `Pulse::Store` to share state between components. Components that `watch` a store re-render automatically when it changes:

```ruby
# app/stores/theme_store.rb
class ThemeStore < Pulse::Store
  attribute :value, default: "light"

  def toggle
    self.value = value == "light" ? "dark" : "light"
  end
end

# app/views/layout.rb
class Layout < Pulse::Component
  def initialize
    @theme = watch(ThemeStore)
  end

  def view_template
    doctype
    html do
      body do
        render Navbar.new
        main(class: "theme-#{@theme.value}") do # <-- read the value
          yield
        end
        pulse_scripts
      end
    end
  end
end

# app/views/navbar.rb
class Navbar < Pulse::Component
  def initialize
    @theme = watch(ThemeStore)
  end

  def view_template
    nav { button(click: :toggle_theme) { "Toggle theme" } }
  end

  def toggle_theme
    @theme.toggle # <-- update the value
  end
end
```

Clicking the button in `Navbar` re-renders both `Navbar` and `Layout`. Each connection gets its own store instance, so one user's theme doesn't affect other users.

### Live model updates

`watch` also works with Active Record models. Call `Pulse.broadcast` when a model changes, and every component watching that record re-renders:

```ruby
# app/models/article.rb
class Article < ApplicationRecord
  after_commit :broadcast_upvotes, if: :saved_change_to_upvotes?

  private

  def broadcast_upvotes
    Pulse.broadcast(self)
  end
end

# app/views/articles/card.rb
class Articles::Card < Pulse::Component
  def initialize(article:)
    @article = watch(article)
  end

  def view_template
    div do
      h1 { @article.title }
      p { @article.body }
      p { "Upvotes: #{@article.upvotes}" }
    end
  end
end
```

Pulse reloads the record and re-renders every connected component watching it. `watch` also accepts a block that runs with the reloaded record before the component is replaced:

```ruby
@article = watch(article) do |article|
  @flash = "#{article.title} was updated"
end
```

## The page object

Components can inspect the current page, update query parameters and local storage, or navigate through the live connection:

```ruby
page.query[:theme] = "dark"
page.local_storage[:theme] = "dark"
page.navigate("/articles")
```

| Method                | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `page.path`           | the current path                                              |
| `page.url`            | the current path with the query string                        |
| `page.query`          | query parameters; writing to it updates the URL               |
| `page.local_storage`  | browser local storage, kept across page loads and reconnects  |
| `page.navigate(url)`  | navigates to `url`                                            |

## Targeted updates

An event normally ends with an automatic `replace`, but components can choose another operation:

```ruby
replace                          # re-render this component in place
append(target: "notifications")  # add to the end of #notifications
prepend(target: "notifications") # add to the start of #notifications
remove                           # remove this component from the page
```

## Demo

The application in `demo/` is a small article CMS demonstrating controller-backed forms, transient state, stores, model broadcasts, keyed nested components, and targeted updates.

```sh
rake install
cd demo
bundle install
rage db:prepare
rage s
```

Open `http://localhost:3000` in two tabs. Expanding an article is local to each connection, while publishing or unpublishing it persists to the database and broadcasts to the other tab.

## Contributing

Bug reports, design feedback, and pull requests are welcome. Because Pulse is still experimental, please open an issue before investing in a large change so the approach can be discussed first.

## License

Pulse is available under the [MIT License](LICENSE.txt).
