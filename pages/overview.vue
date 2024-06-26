<template>
  <section class="section">
    <template v-if="events.length && event">
      <div class="columns">
        <div class="column">
          <b-button
            icon-left="chevron-left"
            :disabled="eventIndex === 0"
            @click="previousEvent"
          >
            Previous
          </b-button>
          <b-button
            icon-right="chevron-right"
            :disabled="eventIndex + 1 === events.length"
            @click="nextEvent"
          >
            Next
          </b-button>
        </div>
        <div v-if="votingLimitsEnabled" class="column has-text-right">
          <p>3 votes left</p>
          <p>1 suggestion left</p>
        </div>
      </div>

      <div class="columns">
        <card :title="event.date.toLocaleDateString()">
          <template v-slot:header>
            <header class="card-header">
              <p class="card-header-title has-text-grey">
                {{ event.date.toLocaleDateString() }}
              </p>
              <h2 class="title">{{ event.title }}</h2>
            </header>
          </template>
          <template v-slot:default>
            <p class="description" v-html="event.description"></p>
            <div v-if="!suggestions.length" class="has-text-centered">
              No suggestions for this event!
            </div>
            <template v-else>
              <transition-group name="list" tag="div">
                <suggestion-media-object
                  v-for="suggestion in suggestions"
                  :key="suggestion.id"
                  :suggestion="suggestion"
                  @vote="vote"
                  @unvote="unvote"
                  @delete="deleteSuggestion"
                />
              </transition-group>
            </template>
          </template>
        </card>
      </div>
      
      <div class="columns is-mobile">
        <card title="Suggest a movie">
          <preliminary-suggestion-media-object
            v-if="selectedPreliminarySuggestion"
            :suggestion-item="selectedPreliminarySuggestion"
            :already-suggested="
              isAlreadySuggested(selectedPreliminarySuggestion)
            "
            @suggest="suggest"
            @cancel="selectedPreliminarySuggestion = null"
          />
          <search-bar
            @select="(selected) => (selectedPreliminarySuggestion = selected)"
          />
        </card>
      </div>
    </template>
    <template v-else>
      <p>No events available.</p>
    </template>
  </section>
</template>

<style lang="scss">
.title {
  font-size: 1.5em; // Adjust as needed
  margin-bottom: 10px; // Adjust as needed
  display: flex;
  padding: 15px;
  justify-content: space-between;
  flex: 2.6 1 70%;
}

.description {
  font-size: 1em; // Adjust as needed
  color: grey; // Adjust as needed
  margin: 0% 3.5% 4% 3.5%;
  font-weight: bold;
  padding-bottom: 20px;
}

.list-enter-active,
.list-leave-active,
.list-move {
  transition: 500ms cubic-bezier(0.59, 0.12, 0.34, 0.95);
  transition-property: opacity, transform;
}

.list-enter {
  opacity: 0;
  transform: translateY(50px);
}

.list-enter-to {
  opacity: 1;
  transform: translateY(0);
}

.list-leave-active {
  position: absolute;
}

.list-leave-to {
  opacity: 0;
  transform: scaleY(0);
  transform-origin: center top;
}
</style>

<script lang="ts">
import { Component, Vue, Watch } from "vue-property-decorator";
import { Event } from "@/types/event";
import firestore from "@/plugins/firestore";
import { QuerySnapshot } from "@firebase/firestore-types";
import Card from "~/components/Card.vue";
import SuggestionMediaObject from "~/components/SuggestionMediaObject.vue";
import PreliminarySuggestionMediaObject from "~/components/PreliminarySuggestionMediaObject.vue";
import SearchBar from "~/components/SearchBar.vue";
import firebase from "@firebase/app";

@Component({
  components: {
    Card,
    PreliminarySuggestionMediaObject,
    SuggestionMediaObject,
    SearchBar,
  },
})
export default class Overview extends Vue {
  selectedPreliminarySuggestion = null;
  event: Event = null;
  eventIndex: number = null;
  suggestions = [];
  eventSuggestionsListener = null;
  votingLimitsEnabled = false;

  async created() {
    await this.$store.dispatch("events/getEvents");
    if (this.events.length) this.selectEvent();
  }

  get events(): Event[] {
    return this.$store.state.events.events;
  }

  /**
   * On every event change detach the old event suggestions data listener and attach the new one.
   */
  @Watch("event")
  eventChange(event) {
    if (this.eventSuggestionsListener) this.eventSuggestionsListener();
    this.eventSuggestionsListener = firestore
      .collection(`events/${event.id}/suggestions`)
      .where("deleted", "==", false)
      .orderBy("votesCount", "desc")
      .orderBy("createdAt", "asc")
      .onSnapshot(async (suggestionsSnapshot) => {
        let suggestions = [];
        let userFetchPromises = [];

        // Iterate over each suggestion and prepare to fetch user data
        suggestionsSnapshot.forEach((doc) => {
          const suggestion = doc.data();
          suggestion.id = doc.id;
          suggestions.push(suggestion);
          userFetchPromises.push(suggestion.userReference.get());
        });

        const users = await Promise.all(userFetchPromises);

        // Map user data back to suggestions
        suggestions = suggestions.map((suggestion, index) => {
          const userData = users[index].data();
          return { ...suggestion, user: userData };
        });

        // Sort the suggestions
        this.suggestions = suggestions.sort((a, b) => {
          const voteDifference = b.votesCount - a.votesCount;
          if (voteDifference !== 0) return voteDifference;
          return a.createdAt.seconds - b.createdAt.seconds; // Adjust if your timestamp format is different
        });
      });
  }

  /**
   * Select the next upcoming event; fallback to a previous one
   */
  selectEvent(): void {
    const nextEventIndex = this.events.findIndex(
      (event) => event.date.getTime() >= new Date().getTime()
    );
    this.eventIndex =
      nextEventIndex > -1 ? nextEventIndex : this.events.length - 1;
    this.event = this.events[this.eventIndex];
  }

  previousEvent() {
    this.eventIndex = Math.abs(this.eventIndex - 1) % this.events.length;
    this.event = this.events[this.eventIndex];
  }

  nextEvent() {
    this.eventIndex = (this.eventIndex + 1) % this.events.length;
    this.event = this.events[this.eventIndex];
  }

  isAlreadySuggested(preliminarySuggestion) {
    return !!this.suggestions.find(
      (suggestion) => suggestion.suggestedItem.id === preliminarySuggestion.id
    );
  }

  async suggest(suggestion) {
    try {
      await firestore.collection(`events/${this.event.id}/suggestions`).add({
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        userReference: firestore.doc(`users/${this.user.uid}`),
        userEmail: firestore.doc(`users/${this.user.email}`),
        deleted: false,
        suggestedItem: suggestion,
        votesCount: 0,
        votes: [],
      });
      this.selectedPreliminarySuggestion = null;
    } catch (e) {
      this.$buefy.toast.open({ message: "Error while adding the suggestion" });
      throw e;
    }
  }

  async vote(suggestion) {
    try {
      await firestore
        .collection(`events/${this.event.id}/suggestions`)
        .doc(suggestion.id)
        .update({
          votesCount: firebase.firestore.FieldValue.increment(1),
          votes: firebase.firestore.FieldValue.arrayUnion({
            userId: this.user.uid,
            userReference: firestore.doc(`users/${this.user.uid}`),
          }),
        });
    } catch (e) {
      this.$buefy.toast.open({ message: "Error while voting" });
      throw e;
    }
  }

  async unvote(suggestion) {
    try {
      await firestore
        .collection(`events/${this.event.id}/suggestions`)
        .doc(suggestion.id)
        .update({
          votesCount: firebase.firestore.FieldValue.increment(-1),
          votes: firebase.firestore.FieldValue.arrayRemove({
            userId: this.user.uid,
            userReference: firestore.doc(`users/${this.user.uid}`),
          }),
        });
    } catch (e) {
      this.$buefy.toast.open({ message: "Error while unvoting" });
      throw e;
    }
  }

  async deleteSuggestion(suggestion) {
    try {
      await firestore
        .collection(`events/${this.event.id}/suggestions`)
        .doc(suggestion.id)
        .delete();
    } catch (e) {
      this.$buefy.toast.open({ message: "Error while deleting" });
      throw e;
    }
  }

  get user() {
    return this.$store.state.auth.user;
  }
}
</script>
