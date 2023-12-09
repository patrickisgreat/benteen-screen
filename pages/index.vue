<template>
  <main>
    <section class="hero is-fullheight">
      <div class="hero-body">
        <div class="container has-text-centered sub-hero">
          <h1 class="title">
            <img class="hero__logo" src="~assets/transparent_logo.png" alt="Benteen Screen On the Green" />
          </h1>
          <br />
          <br />
          <h2 class="subtitle">
            <b-button class="is-large hero__btn" inverted @click="goToApp">GET STARTED</b-button>
          </h2>
        </div>
      </div>
      <!-- <div class="hero-footer">
        <div v-scroll-to="'#instructions'" class="container has-text-centered">
          <b-icon icon="chevron-down" size="is-large" class="scroll-down__arrow bounce" />
        </div>
      </div> -->
    </section>
  </main>
</template>

<style lang="scss">
@import '~/assets/scss/gradients.scss';

.hero {
  background-image: url('../assets/xp.png');
  background-size: cover;

  .title {
    margin-bottom: -4rem;
  }

  .sub-hero {
    margin-top: 8rem;
  }

  .hero__logo {
    min-width: 20rem;
    max-width: 33%;
  }

  .hero__btn {
    color: white;
    border: none;
    @extend .triple-gradient;
    transition: 0.5s;
    background-size: 200% auto;

    &:hover {
      background-position: right center;
    }
  }

  .scroll-down__arrow {
    color: white;
    margin-bottom: 2rem;
    cursor: pointer;
  }

  .bounce {
    -moz-animation: bounce 2s infinite;
    -webkit-animation: bounce 2s infinite;
    animation: bounce 2s infinite;
  }

  @keyframes bounce {
    0%,
    20%,
    50%,
    80%,
    100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-1rem);
    }
    60% {
      transform: translateY(-0.5rem);
    }
  }
}

#instructions {
  .instructions__image {
    margin: 0 auto;
    max-width: 60%;
  }
}
</style>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({
  layout: 'landing'
})
export default class extends Vue {
  goToApp() {
    this.$router.push('login');
  }

  goToRepo() {
    window.open('https://github.com/AlexImb/pelicula', '_blank');
  }
}
</script>
