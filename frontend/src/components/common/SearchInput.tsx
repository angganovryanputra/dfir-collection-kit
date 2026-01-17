import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { InputWithIcon } from "@/components/common/InputWithIcon";

interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  wrapperClassName?: string;
  inputClassName?: string;
  iconContainerClassName?: string;
}

export function SearchInput({
  wrapperClassName,
  inputClassName,
  iconContainerClassName,
  ...props
}: SearchInputProps) {
  return (
    <InputWithIcon
      icon={<Search className="w-4 h-4" />}
      wrapperClassName={wrapperClassName}
      inputClassName={inputClassName}
      iconContainerClassName={iconContainerClassName}
      {...props}
    />
  );
}
