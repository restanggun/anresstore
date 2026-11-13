"use client";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { slugify } from "@/lib/catalog";

export function CatalogCategoryTabs({values,value,onChange,label,id}: {values: string[];value:string;onChange:(value:string)=>void;label:string;id:string}) {
 const reduce = useReducedMotion();
 return <LayoutGroup id={id}><Tabs value={value} onValueChange={onChange} className="catalog-tabs">
   <TabsList aria-label={label} className="catalog-tabs-list" loop>
    {values.map(name => <TabsTrigger key={name} value={name} id={`${id}-tab-${slugify(name)}`} aria-controls={`${id}-panel`} className="catalog-tab">
      {value === name && <motion.span className="catalog-tab-fill" layoutId="active-tab" transition={reduce ? {duration:0} : {type:"spring",stiffness:420,damping:36}}/>}
      <span className="catalog-tab-label">{name}</span>
    </TabsTrigger>)}
   </TabsList>
 </Tabs></LayoutGroup>;
}
