<script lang="ts">
    export let key: string
    export let value: any
</script>

<div class="flex hover:bg-yellow-100 leading-4 p-1">
    <div class="min-w-40 w-full">{key}</div>
    <div class="font-semibold">{value}</div>
</div>
