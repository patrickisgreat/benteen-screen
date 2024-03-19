<template>
  <b-modal :active="isActive" :width="640" scroll="keep">
    <form action="">
      <div class="modal-card" style="width: auto">
        <header class="modal-card-head">
          <p class="modal-card-title">Add event</p>
        </header>
        <section class="modal-card-body">
          <b-field label="Title">
            <b-input v-model="event.title" type="text"> </b-input>
          </b-field>
          <b-field label="Description">
            <!-- Replace the b-input with vue-quill-editor for rich text support -->
            <quill-editor
              v-model="event.description"
              :options="editorOptions"
            ></quill-editor>
          </b-field>
        </section>
        <footer class="modal-card-foot">
          <button class="button" @click.prevent="close">Close</button>
          <button class="button is-primary" @click.prevent="save">Save</button>
        </footer>
      </div>
    </form>
  </b-modal>
</template>

<script lang="ts">
import { Component, Vue, Prop, Emit } from "vue-property-decorator";
import { quillEditor } from "vue-quill-editor";
import "quill/dist/quill.core.css";
import "quill/dist/quill.snow.css";

@Component({
  components: {
    quillEditor,
  },
})
export default class AddEventModal extends Vue {
  @Prop() isActive: boolean;
  event = {
    title: "",
    description: "",
  };

  // Add editorOptions if you want to customize Quill editor
  editorOptions = {
    debug: "info",
    modules: {
      toolbar: true,
    },
    placeholder: "Compose an epic...",
    theme: "snow",
  };
  @Emit()
  close() {
    return null;
  }

  @Emit()
  save() {
    return this.event;
  }
}
</script>

<style>
/* You might need to add some styles */
</style>
