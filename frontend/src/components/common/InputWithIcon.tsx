import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Input } from "@/components/ui/input";

interface InputWithIconProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  wrapperClassName?: string;
  inputClassName?: string;
  icon: ReactNode;
  iconContainerClassName?: string;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
}

export function InputWithIcon({
  wrapperClassName,
  inputClassName,
  iconContainerClassName,
  icon,
  type = "text",
  ...props
}: InputWithIconProps) {
  return (
    <div className={cn("relative flex-1", wrapperClassName)}>
      <span
        className={cn(
          "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground",
          iconContainerClassName
        )}
      >
        {icon}
      </span>
      <Input type={type} {...props} className={cn("pl-10", inputClassName)} />
    </div>
  );
}
