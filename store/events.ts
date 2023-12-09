import { Event } from '@/types/event';
import { MutationTree, ActionTree } from 'vuex';
import firestore from '@/plugins/firestore';
import { QuerySnapshot, QueryDocumentSnapshot, DocumentData, Timestamp } from '@firebase/firestore-types';

interface State {
  loading: boolean;
  events: Event[];
}

export const state = (): State => ({
  loading: false,
  events: []
});

export const mutations: MutationTree<State> = {
  setLoading(state: State, loading: boolean): void {
    state.loading = loading;
  },
  setEvents(state: State, events: Event[]): void {
    state.events = events;
  }
};

export const actions: ActionTree<State, State> = {
  // https://nuxtjs.org/guide/vuex-store/#the-nuxtserverinit-action
  // async nuxtServerInit({ commit }, { req }) {
  // },

  // Fetch events from Firestore once
  async getEvents({ commit }) {
    commit('setLoading', true);

    const eventsSnapshot: QuerySnapshot = await firestore
      .collection('events')
      .orderBy('timestamp')
      .get();
      const events: Event[] = eventsSnapshot.docs.map((event: QueryDocumentSnapshot) => {
        const eventData: DocumentData = event.data();
        const timestamp: Timestamp = eventData.timestamp;
        const date: Date = new Date(timestamp.seconds * 1000 + timestamp.nanoseconds);
        return { id: event.id, timestamp, date, title: eventData.title, description: eventData.description };
      });
  

    commit('setEvents', events);
    commit('setLoading', false);
  },

  async softDeleteSuggestion({ commit }, { eventId, suggestionId }) {
    // Get a reference to the Firestore document
    const docRef = firestore.collection(`events/${eventId}/suggestions`).doc(suggestionId);
    
    // Update Firestore and return the Promise
    return docRef.update({ deleted: true });
  },

  async undeleteSuggestion({ commit }, { eventId, suggestionId }) {
    const docRef = firestore.collection(`events/${eventId}/suggestions`).doc(suggestionId);
    
    return docRef.update({ deleted: false });
  },

  async addEvent({ dispatch }, event) {
    await firestore.collection('events').add(event);
    dispatch('getEvents');
  },

  async updateEvent({ dispatch }, event) {
    // Separate out 'editedTitle', 'editedDescription' and 'editMode' properties which shouldn't be stored in Firebase
    const { editMode, editedTitle, editedDescription, ...eventToUpdate } = event;

    await firestore
    .collection('events')
    .doc(event.id)
    .update({
      title: event.title,
      description: event.description
    });
  dispatch('getEvents');
  },
  async deleteEvent({ dispatch }, event) {
    await firestore
      .collection('events')
      .doc(event.id)
      .delete();
    dispatch('getEvents');
  }
};