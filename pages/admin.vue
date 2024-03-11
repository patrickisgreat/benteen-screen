<template>
  <section class="section">
    <div class="columns">
      <div class="column is-narrow">
        <calendar v-model="calendarDate" :events="calendarEvents" />
      </div>

      <card :title="calendarDate.toLocaleDateString()">
        <template v-if="!currentDateEvents.length">
          No events on this date.
        </template>
        <template v-else>
          <b-collapse
            v-for="(event, index) in currentDateEvents"
            :key="event.id"
            class="card"
            :open="!index"
          >
            <div
              slot="trigger"
              slot-scope="props"
              class="card-header"
              role="button"
            >
              <span class="card-header-title">{{ event.title }}</span>
              <a class="card-header-icon">
                <b-icon :icon="props.open ? 'menu-up' : 'menu-down'"> </b-icon>
              </a>
            </div>
            <div class="card-content" v-if="!editingEvents[event.id]">
              <div class="content">{{ event.description }}</div>
            </div>
            <div class="card-content" v-else>
              <div class="content">
                <b-field label="Title">
                  <b-input v-model="editingEvents[event.id].title" type="text">
                  </b-input>
                </b-field>
                <b-field label="Description">
                  <b-input
                    v-model="editingEvents[event.id].description"
                    type="textarea"
                  >
                  </b-input>
                </b-field>
              </div>
            </div>
            <footer class="card-footer">
              <a class="card-footer-item" @click="toggleEditMode(event)">{{
                editingEvents[event.id] ? "Save" : "Edit"
              }}</a>
              <a
                class="card-footer-item"
                @click="cancelEdit(event)"
                v-if="editingEvents[event.id]"
                >Cancel</a
              >
              <a
                class="card-footer-item has-text-danger"
                @click="deleteEvent(event)"
                >Delete</a
              >
            </footer>
          </b-collapse>
        </template>

        <br />
        <b-button class="m-t-lg" @click="isEventModalActive = true"
          >Add new</b-button
        >
      </card>
      <card>
        <template v-if="!currentDateEvents.length">
          No events on this date.
        </template>
        <template v-else>
          <h3>Suggestions for selected event:</h3>
          <div
            v-for="(suggestion, index) in suggestions"
            :key="index"
            class="admin-list-card"
          >
            <!-- Display suggestion title -->
            <h4>Title: {{ suggestion.suggestedItem.title }}</h4>

            <!-- Display user who made the suggestion -->
            <p><b>Suggested by:</b> {{ suggestion.userEmail }}</p>

            <!-- Display number of votes -->
            <p>Votes: {{ suggestion.votes.length }}</p>
            <div v-if="suggestion.votes.length">
              <p><b>Voters:</b></p>
              <ul>
                <li
                  v-for="(voter, index) in suggestion.voters"
                  :key="`voter-${index}`"
                >
                  {{ voter }}
                </li>
              </ul>
            </div>

            <!-- Soft delete button -->
            <button v-if="!suggestion.deleted" @click="softDelete(suggestion)">
              Delete
            </button>

            <!-- Undelete button -->
            <button v-else @click="undelete(suggestion)">Undelete</button>
            <br />
            <!-- Add any other suggestion details here -->
          </div>
        </template>
      </card>
    </div>
    <add-event-modal
      :is-active="isEventModalActive"
      @close="isEventModalActive = false"
      @save="saveEvent"
    />
  </section>
</template>

<style lang="scss">
.admin-list-card {
  margin-bottom: 30px;
  background-color: #d0cece;
  padding: 10px;
}
</style>

<script lang="ts">
import { Component, Vue, Watch } from "vue-property-decorator";
import firestore from "@/plugins/firestore";
import Card from "@/components/Card.vue";
import Calendar from "@/components/Calendar.vue";
import AddEventModal from "@/components/AddEventModal.vue";
import { Event } from "@/types/event";
import { isSameDay } from "@/helpers/datetime";
import { QuerySnapshot } from "@firebase/firestore-types";

@Component({
  components: {
    Card,
    Calendar,
    AddEventModal,
  },
})
export default class Admin extends Vue {
  calendarDate: Date = new Date();
  isEventModalActive = false;
  event: Event = null;
  suggestions = [];
  eventSuggestionsListener = null;

  editingEvents = {};

  get selectedEvent(): Event | null {
    const currentDateEvents = this.currentDateEvents;
    return currentDateEvents.length > 0 ? currentDateEvents[0] : null;
  }

  @Watch("selectedEvent")
  onSelectedEventChange(selectedEvent) {
    this.event = selectedEvent;
  }

  @Watch("event")
  async eventChange(event) {
    if (event === null) {
      console.log("No event selected");
      if (this.eventSuggestionsListener) {
        this.eventSuggestionsListener();
        this.eventSuggestionsListener = null;
      }
      this.suggestions = [];
    } else {
      if (this.eventSuggestionsListener) this.eventSuggestionsListener();
      this.eventSuggestionsListener = firestore
        .collection(`events/${event.id}/suggestions`)
        .onSnapshot(async (suggestionsSnapshot: QuerySnapshot) => {
          let suggestionsArr = [];
          suggestionsSnapshot.docs.forEach(async (doc) => {
            const suggestion = doc.data();
            const userDoc = await suggestion.userReference.get();
            const userEmail = userDoc.exists
              ? userDoc.data().email
              : "No email found";

            const voters = await this.fetchVoters(suggestion.votes);

            suggestionsArr.push({
              ...suggestion,
              userEmail,
              id: doc.id,
              voters,
            });
          });

          this.suggestions = suggestionsArr;
        });
    }
  }

  async fetchVoters(voteIds) {
    const voters = [];
    if (voteIds && voteIds.length) {
      const voterPromises = voteIds.map(async (voteRef) => {
        // Assuming voteRef is a document reference, we need to extract the document ID
        const userId = typeof voteRef === "string" ? voteRef : voteRef.id;
        const userDoc = await firestore.collection("users").doc(userId).get();
        return userDoc.exists ? userDoc.data().username : "Unknown";
      });
      return Promise.all(voterPromises);
    }
    return voters;
  }

  toggleEditMode(event) {
    if (this.editingEvents[event.id]) {
      this.updateEvent(event);
    } else {
      this.$set(this.editingEvents, event.id, Object.assign({}, event));
    }
  }

  cancelEdit(event) {
    this.$delete(this.editingEvents, event.id);
  }

  created() {
    this.$store.dispatch("events/getEvents");
  }

  get events(): Event[] {
    return this.$store.state.events.events;
  }

  get calendarEvents(): Date | Object {
    return this.events.map((event) => event.date);
  }

  saveEvent(event) {
    return event.id ? this.updateEvent(event) : this.addNewEvent(event);
  }

  get currentDateEvents(): Event[] {
    return this.events
      .filter((event) => isSameDay(event.date, this.calendarDate))
      .map((event) => ({
        ...event,
        editMode: false,
        editedTitle: event.title,
        editedDescription: event.description,
      }));
  }

  async addNewEvent(event) {
    try {
      await this.$store.dispatch("events/addEvent", {
        ...event,
        timestamp: this.calendarDate,
      });
      this.isEventModalActive = false;
      this.$buefy.toast.open({
        message: "Event added",
      });
    } catch (e) {
      this.$buefy.toast.open({
        message: "Error while adding event",
      });
    }
  }

  editEvent(event) {
    event.editMode = true;
  }

  async updateEvent(event) {
    // Grab the edited event, then delete it from the editingEvents.
    const editedEvent = this.editingEvents[event.id];
    this.$delete(this.editingEvents, event.id);

    // Continue with your update logic...
    try {
      await this.$store.dispatch("events/updateEvent", editedEvent);
      this.$buefy.toast.open({
        message: "Event updated",
      });
    } catch (e) {
      this.$buefy.toast.open({
        message: "Error while updating event",
      });
    }
  }

  deleteEvent(event) {
    this.$store.dispatch("events/deleteEvent", event);
  }
  async updateAllSuggestions() {
    // 1. Fetch all events
    const eventsSnapshot = await firestore.collection("events").get();

    // Iterate through all events
    for (let eventDoc of eventsSnapshot.docs) {
      const eventId = eventDoc.id;

      // 2. Fetch all suggestions for this event
      const suggestionsSnapshot = await firestore
        .collection(`events/${eventId}/suggestions`)
        .get();

      // Iterate through all suggestions
      for (let suggestionDoc of suggestionsSnapshot.docs) {
        const suggestionId = suggestionDoc.id;
        const suggestionData = suggestionDoc.data();

        // 3. Fetch the user who added this suggestion
        const userDoc = await suggestionData.userReference.get();
        const userData = userDoc.data();

        // 4. Update this suggestion with user's email and 'deleted' field
        await firestore
          .collection(`events/${eventId}/suggestions`)
          .doc(suggestionId)
          .update({
            userEmail: userData.email,
            deleted: false,
          });
      }
    }
  }

  async softDelete(suggestion) {
    try {
      await this.$store.dispatch("events/softDeleteSuggestion", {
        eventId: this.event.id,
        suggestionId: suggestion.id,
      });

      // Only update the local state if Firestore update was successful
      suggestion.deleted = true;

      this.$buefy.toast.open({
        message: "Suggestion deleted",
      });
    } catch (e) {
      this.$buefy.toast.open({
        message: "Error while deleting suggestion",
        type: "is-danger",
      });
    }
  }

  async undelete(suggestion) {
    try {
      await this.$store.dispatch("events/undeleteSuggestion", {
        eventId: this.event.id,
        suggestionId: suggestion.id,
      });

      // Only update the local state if Firestore update was successful
      suggestion.deleted = false;

      this.$buefy.toast.open({
        message: "Suggestion undeleted",
      });
    } catch (e) {
      this.$buefy.toast.open({
        message: "Error while undeleting suggestion",
        type: "is-danger",
      });
    }
  }
}
</script>
