class Article < ApplicationRecord
  validates :title, presence: true
  validates :body, presence: true
  validates :status, inclusion: { in: %w[draft published] }

  after_commit :broadcast_status_update

  private

  def broadcast_status_update
    if self.previous_changes.key?("status")
      Pulse::Tracking.broadcast(self)
    end
  end
end
