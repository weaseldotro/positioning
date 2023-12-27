<script lang="ts">
    export let key: string
    export let value: any
</script>

<div class="flex gap-2">
    <div class="min-w-40 w-full">{key}:</div>
    <div class="font-semibold">{value}</div>
</div>
