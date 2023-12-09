<template>
  <article class="media">
    <figure class="image thumbnail-image">
      <img
        :src="`https://image.tmdb.org/t/p/w500/${suggestion.suggestedItem.poster_path}`"
      />
    </figure>

    <div class="media-content">
      <div class="content">
        <h3>
          {{ suggestion.suggestedItem.title }} ({{
            suggestion.suggestedItem.release_date.split("-")[0]
          }})
        </h3>
        <p>
          {{ suggestion.suggestedItem.overview.slice(0, 200) + "..." }}
        </p>
        <a
          :href="`https://www.themoviedb.org/movie/${suggestion.suggestedItem.id}`"
          target="_blank"
        >
          Find more
          <b-icon icon="open-in-new" size="is-small"> </b-icon>
        </a>

        <div class="is-pulled-right">
          <!-- TODO: Add round users avatars and name tooltips -->
          <div v-if="suggestion.votes.length" class="votes__container">
            {{ suggestion.votes.length }} votes
          </div>
          <transition name="fade">
            <span class="vote-icon-btn">
              <b-icon
                v-if="userVoted()"
                type="is-danger"
                icon="heart"
                @click.native="$emit('unvote', suggestion)"
              />
              <b-icon
                v-else
                icon="heart-outline"
                @click.native="$emit('vote', suggestion)"
              />
            </span>
          </transition>
        </div>
      </div>
    </div>
    <div class="media-right">
      <button
        v-if="isUserSuggestion()"
        class="delete"
        @click="$emit('delete', suggestion)"
      ></button>
    </div>
  </article>
</template>

<style lang="scss" scoped>
.votes__container {
  display: inline-block;
  font-size: 1rem;
}

.vote-icon-btn {
  position: relative;
  top: 0.25rem;
  margin-left: 0.5rem;
  cursor: pointer;
}

.thumbnail-image {
  width: 96px; // Default size
  height: 96px; // Default size
}

@media (max-width: 768px) {
  // Adjust this value as needed
  .thumbnail-image {
    width: 250px; // Smaller size for mobile
  }
}
</style>

<script lang="ts">
import { Component, Vue, Prop } from "vue-property-decorator";

@Component
export default class SuggestionMediaObject extends Vue {
  @Prop() suggestion;

  userVoted() {
    return (
      this.suggestion.votes.findIndex((vote) => vote.userId === this.user.uid) >
      -1
    );
  }

  isUserSuggestion() {
    console.log("Suggestion User ID:", this.suggestion.user?.id);
    console.log("Current User ID:", this.user?.uid);
    console.log(
      "User Suggestion Comparison:",
      this.suggestion.user?.id === this.user?.uid
    );
    console.log("USER", this.suggestion.user);
    return this.suggestion.user?.uid === this.user?.uid;
  }

  get user() {
    return this.$store.state.auth.user;
  }
}
</script>
