"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { LoaderCircle, ScanSearch } from "lucide-react"

interface Props {
  onLookup: () => void
  loading: boolean
}

/**
 * ARES lookup icon, absolutely positioned inside the right edge of an input.
 * Render it as a sibling of an `<Input>` within a `relative` container, and
 * give the input `pr-9` so the text does not run under the icon.
 */
export function AresLookupButton({ onLookup, loading }: Props) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onLookup}
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-md bg-subtle p-1 text-text-secondary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed"
          >
            {loading ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <ScanSearch size={16} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>ARES</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
