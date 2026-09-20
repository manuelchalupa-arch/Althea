function Test() {
  return (
    <button>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-body-md text-sm text-on-surface truncate">Test</div>
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="px-2 py-0.5 rounded-full text-[9px] font-label-md font-semibold uppercase">Label</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

export default Test