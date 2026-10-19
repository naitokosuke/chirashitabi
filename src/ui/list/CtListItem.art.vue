<script setup lang="ts">
import CtAvatar from "../avatar/CtAvatar.vue";
import CtButton from "../button/CtButton.vue";
import CtPanel from "../panel/CtPanel.vue";

defineArt("./CtListItem.vue", {
  title: "CtListItem",
  category: "Layout",
  description:
    "A row of a list on a panel: a face, a title and its notes, and what can be done to it",
  status: "ready",
});
</script>

<style scoped>
.frame {
  max-width: var(--stage-md);
}
</style>

<art>
  <variant default name="People">
    <div class="frame">
      <CtPanel as="ul" pad="none">
        <CtListItem :notes="['Owner', 'You']" title="Yuki">
          <template #start><CtAvatar color="#5b7fd6" name="Yuki" /></template>
        </CtListItem>
        <CtListItem title="Ken">
          <template #start><CtAvatar color="#d65b6a" name="Ken" /></template>
          <template #end><CtButton>Remove</CtButton></template>
        </CtListItem>
        <CtListItem faded :notes="['Kept until 11/20']" title="Kyoto weekend" />
      </CtPanel>
    </div>
  </variant>
</art>
