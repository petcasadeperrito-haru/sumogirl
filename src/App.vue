<script setup>
import { ref, onMounted } from 'vue';
import { client } from './libs/microcms.js';

const articles = ref([]);

onMounted(async () => {
  const data = await client.get({ endpoint: 'contents' });
  articles.value = data.contents;
});
</script>

<template>
  <main style="max-width: 800px; margin: 0 auto; padding: 2rem;">
    <h1>SUMO GIRL</h1>
    <p>記事一覧（microCMSから取得）</p>

    <ul>
      <li v-for="article in articles" :key="article.id">
        <strong>{{ article.title_ja }}</strong>
        <span>／ {{ article.title_en }}</span>
      </li>
    </ul>
  </main>
</template>