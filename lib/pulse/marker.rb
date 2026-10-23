module Pulse::Marker
  def __mark
    @__marked = true
  end

  def __unmark
    @__marked = false
  end

  def __marked?
    @__marked
  end
end
