/**
 * Interface to represent the syllabus data loaded from the yaml file. 
 * 
 */

export interface Lesson {
    name: string;
    exercise?: string;
    lesson?: string; // Some lessons have a markdown reference instead
    display?: boolean;
    lessons?: Lesson[]; // Nested lessons (e.g., "Turtle Tricks A")
    terminal?: boolean;

}

export interface Module {
    name: string;
    overview?: string;
    lessons?: Lesson[];
    isOpen?: boolean;

}

export interface Syllabus {
    name: string;
    description: string;
    module_dir: string;
	filePath?: string|undefined;
    modules: Module[];

}

export interface SylFs {

    syllabusPath: string;
    coursePath: string;
    storageDir: string;
    completionFilePath: string;
}

